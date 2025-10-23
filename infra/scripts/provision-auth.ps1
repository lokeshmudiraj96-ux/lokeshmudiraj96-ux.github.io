#requires -version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Config (read from env or set defaults)
$Region        = $env:AWS_REGION
$EcrRepoName   = if ($env:ECR_REPOSITORY) { $env:ECR_REPOSITORY } else { "quickbite-auth" }
$ClusterName   = if ($env:ECS_CLUSTER) { $env:ECS_CLUSTER } else { "quickbite-cluster" }
$ServiceName   = if ($env:ECS_SERVICE) { $env:ECS_SERVICE } else { "quickbite-auth-service" }
$LogGroupName  = "/ecs/quickbite-auth"

if (-not $Region) { throw "AWS_REGION env var is required (e.g., us-east-1)." }

Write-Host "Using Region: $Region" -ForegroundColor Cyan
aws configure set region $Region | Out-Null

# Discover default VPC and subnets
$vpcId = aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query "Vpcs[0].VpcId" --output text
if (-not $vpcId -or $vpcId -eq "None") { throw "No default VPC found in $Region. Create a VPC or provide IDs manually." }
Write-Host "Default VPC: $vpcId" -ForegroundColor Cyan

$subnetIds = aws ec2 describe-subnets --filters Name=vpc-id,Values=$vpcId --query "Subnets[?State=='available'].SubnetId" --output text
$subnetArr = $subnetIds -split "\s+" | Where-Object { $_ -ne "" }
if ($subnetArr.Count -lt 2) { throw "Need at least two subnets in the VPC." }
$sub1 = $subnetArr[0]
$sub2 = $subnetArr[1]
Write-Host "Using subnets: $sub1, $sub2" -ForegroundColor Cyan

# Create ECR repository if not exists
try {
  aws ecr describe-repositories --repository-names $EcrRepoName | Out-Null
  Write-Host "ECR repository exists: $EcrRepoName" -ForegroundColor Yellow
} catch {
  Write-Host "Creating ECR repo: $EcrRepoName" -ForegroundColor Green
  aws ecr create-repository --repository-name $EcrRepoName | Out-Null
}

# Create CloudWatch Logs log group (idempotent)
try {
  aws logs create-log-group --log-group-name $LogGroupName | Out-Null
  Write-Host "Created log group $LogGroupName" -ForegroundColor Green
} catch {
  Write-Host "Log group exists: $LogGroupName" -ForegroundColor Yellow
}

# IAM: Create task execution role
$execRoleName = "quickbite-ecsTaskExecutionRole"
$taskRoleName = "quickbite-ecsTaskRole"

$assumeRolePolicy = @'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "ecs-tasks.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
'@

function Ensure-Role($roleName, $managedPolicyArns) {
  try {
    $role = aws iam get-role --role-name $roleName | ConvertFrom-Json
    Write-Host "Role exists: $roleName" -ForegroundColor Yellow
  } catch {
    Write-Host "Creating role: $roleName" -ForegroundColor Green
    $null = aws iam create-role --role-name $roleName --assume-role-policy-document $assumeRolePolicy
  }
  foreach ($p in $managedPolicyArns) {
    try {
      aws iam attach-role-policy --role-name $roleName --policy-arn $p | Out-Null
    } catch {}
  }
  return (aws iam get-role --role-name $roleName | ConvertFrom-Json).Role.Arn
}

$execPolicies = @(
  "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
)
$taskPolicies = @(
)

$executionRoleArn = Ensure-Role -roleName $execRoleName -managedPolicyArns $execPolicies
$taskRoleArn      = Ensure-Role -roleName $taskRoleName -managedPolicyArns $taskPolicies

Write-Host "Execution Role ARN: $executionRoleArn" -ForegroundColor Cyan
Write-Host "Task Role ARN: $taskRoleArn" -ForegroundColor Cyan

# Security Groups
$albSgName = "quickbite-alb-sg"
$svcSgName = "quickbite-auth-sg"

function Ensure-SG($sgName, $desc) {
  $sgId = aws ec2 describe-security-groups --filters Name=group-name,Values=$sgName Name=vpc-id,Values=$vpcId --query "SecurityGroups[0].GroupId" --output text
  if ($sgId -and $sgId -ne "None") {
    Write-Host "SG exists: $sgName ($sgId)" -ForegroundColor Yellow
  } else {
    Write-Host "Creating SG: $sgName" -ForegroundColor Green
    $sgId = aws ec2 create-security-group --group-name $sgName --description "$desc" --vpc-id $vpcId --query GroupId --output text
  }
  return $sgId
}

$albSgId = Ensure-SG -sgName $albSgName -desc "ALB SG for QuickBite"
$svcSgId = Ensure-SG -sgName $svcSgName -desc "Auth Service SG for QuickBite"

# Authorize ingress rules (idempotent best-effort)
try { aws ec2 authorize-security-group-ingress --group-id $albSgId --ip-permissions IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges='[{CidrIp=0.0.0.0/0,Description="HTTP"}]' | Out-Null } catch {}
try { aws ec2 authorize-security-group-egress  --group-id $albSgId --ip-permissions IpProtocol=-1,IpRanges='[{CidrIp=0.0.0.0/0,Description="All"}]' | Out-Null } catch {}

# Allow 3001 from ALB SG to Service SG
try { aws ec2 authorize-security-group-ingress --group-id $svcSgId --ip-permissions IpProtocol=tcp,FromPort=3001,ToPort=3001,UserIdGroupPairs='[{GroupId="'+$albSgId+'"}]' | Out-Null } catch {}
try { aws ec2 authorize-security-group-egress  --group-id $svcSgId --ip-permissions IpProtocol=-1,IpRanges='[{CidrIp=0.0.0.0/0}]' | Out-Null } catch {}

# Target Group
$tgName = "quickbite-auth-tg"
$tgArn = aws elbv2 describe-target-groups --names $tgName --query "TargetGroups[0].TargetGroupArn" --output text 2>$null
if (-not $tgArn -or $tgArn -eq "None") {
  Write-Host "Creating Target Group: $tgName" -ForegroundColor Green
  $tgArn = aws elbv2 create-target-group --name $tgName --protocol HTTP --port 3001 --target-type ip --vpc-id $vpcId --health-check-path "/health" --health-check-protocol HTTP --query "TargetGroups[0].TargetGroupArn" --output text
} else {
  Write-Host "Target Group exists: $tgName" -ForegroundColor Yellow
}

# ALB
$albName = "quickbite-alb"
$albArn = aws elbv2 describe-load-balancers --names $albName --query "LoadBalancers[0].LoadBalancerArn" --output text 2>$null
if (-not $albArn -or $albArn -eq "None") {
  Write-Host "Creating ALB: $albName" -ForegroundColor Green
  $albArn = aws elbv2 create-load-balancer --name $albName --type application --scheme internet-facing --subnets $sub1 $sub2 --security-groups $albSgId --query "LoadBalancers[0].LoadBalancerArn" --output text
} else {
  Write-Host "ALB exists: $albName" -ForegroundColor Yellow
}
$albDns = aws elbv2 describe-load-balancers --load-balancer-arns $albArn --query "LoadBalancers[0].DNSName" --output text

# Listener on port 80
$listenerArn = aws elbv2 describe-listeners --load-balancer-arn $albArn --query "Listeners[?Port==`80`].ListenerArn | [0]" --output text 2>$null
if (-not $listenerArn -or $listenerArn -eq "None") {
  Write-Host "Creating HTTP listener :80" -ForegroundColor Green
  $listenerArn = aws elbv2 create-listener --load-balancer-arn $albArn --protocol HTTP --port 80 --default-actions Type=forward,TargetGroupArn=$tgArn --query "Listeners[0].ListenerArn" --output text
} else {
  Write-Host "HTTP listener exists" -ForegroundColor Yellow
}

# ECS Cluster
try {
  aws ecs describe-clusters --clusters $ClusterName --query "clusters[0].clusterArn" --output text | Out-Null
  Write-Host "ECS Cluster exists: $ClusterName" -ForegroundColor Yellow
} catch {
  Write-Host "Creating ECS Cluster: $ClusterName" -ForegroundColor Green
  aws ecs create-cluster --cluster-name $ClusterName | Out-Null
}

# Write outputs
$outDir = "infra/outputs"
$outFile = Join-Path $outDir "auth.json"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Force -Path $outDir | Out-Null }

$payload = [ordered]@{
  region             = $Region
  vpcId              = $vpcId
  subnets            = @($sub1, $sub2)
  ecrRepository      = $EcrRepoName
  clusterName        = $ClusterName
  serviceName        = $ServiceName
  logGroupName       = $LogGroupName
  executionRoleArn   = $executionRoleArn
  taskRoleArn        = $taskRoleArn
  albArn             = $albArn
  albDns             = $albDns
  albSecurityGroupId = $albSgId
  serviceSecurityGroupId = $svcSgId
  targetGroupArn     = $tgArn
}

$payload | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 $outFile

Write-Host "\n=== Provisioning complete ===" -ForegroundColor Green
Write-Host "ALB DNS : http://$albDns" -ForegroundColor Cyan
Write-Host "Exec Role ARN : $executionRoleArn" -ForegroundColor Cyan
Write-Host "Task Role ARN : $taskRoleArn" -ForegroundColor Cyan
Write-Host "Outputs saved to $outFile" -ForegroundColor Cyan

Write-Host "\nNext steps:" -ForegroundColor Yellow
Write-Host "1) Set GitHub repo secrets ECS_TASK_EXECUTION_ROLE_ARN and ECS_TASK_ROLE_ARN with the ARNs above" -ForegroundColor Yellow
Write-Host "2) Run the GitHub Action to push the image and register a task definition" -ForegroundColor Yellow
Write-Host "3) Run infra/scripts/create-auth-service.ps1 to create the ECS service" -ForegroundColor Yellow
