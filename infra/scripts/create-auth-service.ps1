#requires -version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Config
$Region = $env:AWS_REGION
if (-not $Region) { throw "AWS_REGION env var is required (e.g., us-east-1)." }
aws configure set region $Region | Out-Null

$outFile = "infra/outputs/auth.json"
if (-not (Test-Path $outFile)) { throw "Missing outputs file: $outFile. Run provision-auth.ps1 first." }
$data = Get-Content $outFile | ConvertFrom-Json

$ClusterName = $data.clusterName
$ServiceName = $data.serviceName
$Subnets     = $data.subnets
$SvcSgId     = $data.serviceSecurityGroupId
$TgArn       = $data.targetGroupArn
$Family      = "quickbite-auth-task"

Write-Host "Using Cluster: $ClusterName" -ForegroundColor Cyan

# Get latest task definition for the family (created by the GitHub Action)
$taskDefArn = aws ecs list-task-definitions --family-prefix $Family --sort DESC --max-results 1 --query "taskDefinitionArns[0]" --output text
if (-not $taskDefArn -or $taskDefArn -eq "None") { throw "No task definition found for family '$Family'. Run the deploy-auth GitHub Action first." }
Write-Host "Latest Task Definition: $taskDefArn" -ForegroundColor Cyan

# Create the ECS Fargate service (idempotent: if exists, just update to latest task def)
try {
  $existing = aws ecs describe-services --cluster $ClusterName --services $ServiceName --query "services[0].status" --output text
} catch { $existing = "None" }

if ($existing -and $existing -ne "None") {
  Write-Host "Service exists. Updating to latest task definition..." -ForegroundColor Yellow
  aws ecs update-service --cluster $ClusterName --service $ServiceName --task-definition $taskDefArn | Out-Null
} else {
  Write-Host "Creating service '$ServiceName' in cluster '$ClusterName'" -ForegroundColor Green
  $nc = "awsvpcConfiguration={subnets=[$($Subnets -join ',')],securityGroups=[$SvcSgId],assignPublicIp=ENABLED}"
  aws ecs create-service `
    --cluster $ClusterName `
    --service-name $ServiceName `
    --task-definition $taskDefArn `
    --desired-count 1 `
    --launch-type FARGATE `
    --network-configuration $nc `
    --load-balancers targetGroupArn=$TgArn,containerName=auth-service,containerPort=3001 `
    --health-check-grace-period-seconds 30 | Out-Null
}

Write-Host "Service ready. It may take a couple of minutes to stabilize." -ForegroundColor Green
Write-Host "ALB URL: http://$($data.albDns)/health" -ForegroundColor Cyan
