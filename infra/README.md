# Infra bootstrap for Auth Service (AWS)

This folder contains PowerShell scripts to provision the minimal AWS infrastructure for the Auth Service on ECS Fargate using the default VPC. It’s designed for a quick first deploy; you can harden and evolve later.

## What gets created
- ECR repository for images
- CloudWatch Logs log group `/ecs/quickbite-auth`
- IAM roles: ECS task execution role and task role
- Security groups for ALB and ECS tasks
- Target group (IP type) for port 3001
- Application Load Balancer (internet-facing) with HTTP listener forwarding to the target group
- ECS cluster (Fargate)

Optional follow-up (not created by the first script):
- ECS service for the auth task (created by a second script after the first image is pushed)
- RDS PostgreSQL and ElastiCache Redis (create in AWS Console or IaC of your choice, then set the endpoints as secrets)

## Prerequisites
- AWS CLI v2 installed and configured (`aws configure`) with an account that has permissions for ECR, ECS, ELBv2, EC2, IAM, CloudWatch Logs.
- PowerShell 5.1+ (Windows default shell is fine)
- Default VPC exists in your target region (most accounts have one). The scripts automatically discover it and its public subnets.

## Quick start
1) Set GitHub repo secrets (at minimum):
   - AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
   - AWS_REGION (e.g., us-east-1)
   - ECR_REPOSITORY (e.g., quickbite-auth)
   - ECS_CLUSTER (e.g., quickbite-cluster)
   - ECS_SERVICE (e.g., quickbite-auth-service)

   After provisioning, also set:
   - ECS_TASK_EXECUTION_ROLE_ARN
   - ECS_TASK_ROLE_ARN
   - JWT_SECRET
   - DATABASE_URL (e.g., postgres://username:password@db-endpoint:5432/dbname)
   - REDIS_URL (e.g., redis://:password@redis-endpoint:6379)
   - FRONTEND_URL (e.g., https://your-frontend-domain)

2) Provision base infra (ECR, roles, ALB, target group, SGs, cluster):
   - In PowerShell from the repo root:
     - `infra/scripts/provision-auth.ps1`

   It outputs an `infra/outputs/auth.json` file with ARNs and IDs and prints the ALB DNS name.

3) Push the first image by running the GitHub Action “Deploy Auth Service to AWS ECS” once. This builds and pushes the image to ECR and registers a task definition.

4) Create the ECS Service (once):
   - In PowerShell:
     - `infra/scripts/create-auth-service.ps1`
   This wires the cluster, subnets, SGs, target group, and uses the latest task definition family registered by the workflow.

5) After the first service is created, subsequent pushes to `main` that touch the auth service will automatically deploy via the workflow.

## Notes
- These scripts target a simple, low-cost setup using the default VPC and public subnets, with tasks restricted by security groups so they’re only reachable via the ALB.
- For production, consider private subnets + NAT, HTTPS (ACM) on the ALB, WAF, parameter store/Secrets Manager for secrets, and least-privilege IAM.
- If you already have an ALB, security groups, or cluster, adjust the scripts or set the corresponding environment variables to skip creation.
