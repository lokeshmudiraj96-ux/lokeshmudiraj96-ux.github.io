# Auth Service - AWS ECS Deployment

This folder contains artifacts to deploy the Auth Service to AWS ECS (Fargate) via GitHub Actions.

## Prereqs
- AWS account
- ECR repository created (e.g., `quickbite-auth`)
- ECS cluster and service created (Fargate, awsvpc)
- Log group `/ecs/quickbite-auth` exists (or allow ECS to create)
- RDS PostgreSQL and ElastiCache Redis endpoints available

## GitHub Secrets Required
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION` (e.g., `us-east-1`)
- `ECR_REPOSITORY` (e.g., `quickbite-auth`)
- `ECS_CLUSTER` (e.g., `quickbite-cluster`)
- `ECS_SERVICE` (e.g., `quickbite-auth-service`)
- `JWT_SECRET`
- `DATABASE_URL` (e.g., `postgres://user:pass@host:5432/db`)
- `REDIS_URL` (e.g., `redis://host:6379`)
- `FRONTEND_URL` (e.g., `https://www.yourdomain.com`)

## How it works
1. GitHub Action builds Docker image from `auth-service/Dockerfile`
2. Pushes to Amazon ECR
3. Renders ECS task definition with the new image and env vars
4. Updates ECS service and waits for stability

## Health Check
The container exposes `/health`. ECS health checks are configured accordingly.
