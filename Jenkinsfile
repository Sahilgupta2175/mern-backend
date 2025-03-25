pipeline {
    agent any
    
    environment {
        // ===== REQUIRED CONFIGURATION =====
        // Update these values for your environment
        DOCKERHUB_REPO = 'sahilgupta2175'  // Your Docker Hub username
        EC2_IP = '3.89.251.245'            // Your EC2 public IP
        APP_NAME = 'mern-app'               // Your application name
        
        // ===== AUTOMATIC VARIABLES =====
        DOCKER_IMAGE_BACKEND = "${DOCKERHUB_REPO}/${APP_NAME}-backend"
        DOCKER_IMAGE_FRONTEND = "${DOCKERHUB_REPO}/${APP_NAME}-frontend"
        BUILD_TIMESTAMP = sh(script: 'date +%Y%m%d%H%M%S', returnStdout: true).trim()
        
        // ===== CREDENTIALS =====
        // These must be defined in Jenkins credentials store
        DOCKERHUB_CREDS = credentials('docker-hub-creds')
        EC2_SSH_CREDS = credentials('ec2-ssh-key')
        GITHUB_CREDS = credentials('github-creds')  // Only for private repos
    }
    
    options {
        timeout(time: 30, unit: 'MINUTES')
        retry(3)
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }
    
    stages {
        // ===== ENVIRONMENT VALIDATION =====
        stage('Validate Environment') {
            steps {
                script {
                    echo "=== ENVIRONMENT VARIABLES ==="
                    echo "Docker Images: ${DOCKER_IMAGE_BACKEND}, ${DOCKER_IMAGE_FRONTEND}"
                    echo "EC2 Target: ${EC2_IP}"
                    echo "Build Timestamp: ${BUILD_TIMESTAMP}"
                    
                    // Verify credentials exist
                    def missingCreds = []
                    if (!fileExists('/var/lib/jenkins/credentials.xml')) {
                        error("Jenkins credentials store not found")
                    }
                    
                    // Test SSH connection
                    sshagent([EC2_SSH_CREDS]) {
                        sh """
                            if ! ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 ubuntu@${EC2_IP} 'echo "SSH connection successful"'; then
                                echo "SSH connection failed"
                                exit 1
                            fi
                        """
                    }
                }
            }
        }
        
        // ===== CODE CHECKOUT =====
        stage('Checkout Code') {
            steps {
                script {
                    try {
                        retry(3) {
                            checkout([
                                $class: 'GitSCM',
                                branches: [[name: 'main']],
                                extensions: [
                                    [$class: 'RelativeTargetDirectory', relativeTargetDir: 'backend'],
                                    [$class: 'CloneOption', timeout: 10]
                                ],
                                userRemoteConfigs: [[
                                    url: 'https://github.com/Sahilgupta2175/mern-backend.git',
                                    credentialsId: GITHUB_CREDS
                                ]]
                            ])
                            
                            dir('frontend') {
                                checkout([
                                    $class: 'GitSCM',
                                    branches: [[name: 'main']],
                                    userRemoteConfigs: [[
                                        url: 'https://github.com/Sahilgupta2175/mern-frontend.git',
                                        credentialsId: GITHUB_CREDS
                                    ]]
                                ])
                            }
                        }
                        
                        // Verify critical files exist
                        def missingFiles = []
                        if (!fileExists('backend/Dockerfile')) missingFiles << 'backend/Dockerfile'
                        if (!fileExists('frontend/Dockerfile')) missingFiles << 'frontend/Dockerfile'
                        if (missingFiles) error("Missing files: ${missingFiles.join(', ')}")
                        
                    } catch (err) {
                        error("Checkout failed: ${err.message}")
                    }
                }
            }
        }
        
        // ===== BUILD IMAGES =====
        stage('Build Images') {
            failFast true
            parallel {
                stage('Build Backend') {
                    steps {
                        script {
                            dir('backend') {
                                sh """
                                    # Build with cache busting
                                    docker build \
                                        --pull \
                                        --no-cache \
                                        -t ${DOCKER_IMAGE_BACKEND}:${BUILD_TIMESTAMP} \
                                        -t ${DOCKER_IMAGE_BACKEND}:latest \
                                        . 2>&1 | tee docker-build.log
                                    
                                    # Verify image
                                    if ! docker inspect ${DOCKER_IMAGE_BACKEND}:${BUILD_TIMESTAMP} >/dev/null 2>&1; then
                                        echo "Backend image verification failed"
                                        exit 1
                                    fi
                                """
                                archiveArtifacts artifacts: 'docker-build.log'
                            }
                        }
                    }
                }
                
                stage('Build Frontend') {
                    steps {
                        script {
                            dir('frontend') {
                                sh """
                                    docker build \
                                        --pull \
                                        --no-cache \
                                        -t ${DOCKER_IMAGE_FRONTEND}:${BUILD_TIMESTAMP} \
                                        -t ${DOCKER_IMAGE_FRONTEND}:latest \
                                        . 2>&1 | tee docker-build.log
                                    
                                    if ! docker inspect ${DOCKER_IMAGE_FRONTEND}:${BUILD_TIMESTAMP} >/dev/null 2>&1; then
                                        echo "Frontend image verification failed"
                                        exit 1
                                    fi
                                """
                                archiveArtifacts artifacts: 'docker-build.log'
                            }
                        }
                    }
                }
            }
        }
        
        // ===== PUSH TO DOCKER HUB =====
        stage('Push Images') {
            steps {
                script {
                    withCredentials([
                        usernamePassword(
                            credentialsId: 'docker-hub-creds',
                            usernameVariable: 'DOCKER_USER',
                            passwordVariable: 'DOCKER_PASS'
                        )
                    ]) {
                        sh """
                            # Login with error handling
                            if ! echo \$DOCKER_PASS | docker login -u \$DOCKER_USER --password-stdin; then
                                echo "Docker login failed"
                                exit 1
                            fi
                            
                            # Push with retry logic
                            for image in ${DOCKER_IMAGE_BACKEND} ${DOCKER_IMAGE_FRONTEND}; do
                                for tag in ${BUILD_TIMESTAMP} latest; do
                                    for attempt in {1..3}; do
                                        if docker push \$image:\$tag; then
                                            break
                                        elif [ \$attempt -eq 3 ]; then
                                            echo "Failed to push \$image:\$tag after 3 attempts"
                                            exit 1
                                        fi
                                        sleep 5
                                    done
                                done
                            done
                            
                            docker logout
                        """
                    }
                }
            }
        }
        
        // ===== DEPLOYMENT =====
        stage('Deploy to EC2') {
            steps {
                script {
                    // Generate dynamic compose file
                    def composeFile = """
                    version: '3.8'
                    services:
                      backend:
                        image: ${DOCKER_IMAGE_BACKEND}:${BUILD_TIMESTAMP}
                        ports:
                          - "5000:5000"
                        volumes:
                          - ./uploads:/app/uploads
                        environment:
                          - NODE_ENV=production
                        healthcheck:
                          test: ["CMD", "curl", "-f", "http://localhost:5000/posts"]
                          interval: 30s
                          timeout: 10s
                          retries: 3
                        restart: unless-stopped
                        
                      frontend:
                        image: ${DOCKER_IMAGE_FRONTEND}:${BUILD_TIMESTAMP}
                        ports:
                          - "3000:3000"
                        depends_on:
                          backend:
                            condition: service_healthy
                        restart: unless-stopped
                    """
                    
                    // Deploy with SSH
                    sshagent([EC2_SSH_CREDS]) {
                        sh """
                            # Transfer compose file
                            cat << 'EOF' > docker-compose.yml
                            ${composeFile}
                            EOF
                            
                            scp -o StrictHostKeyChecking=no docker-compose.yml ubuntu@${EC2_IP}:~/ || exit 1
                            
                            # Execute deployment
                            ssh -o StrictHostKeyChecking=no ubuntu@${EC2_IP} << 'DEPLOY'
                                set -e # Exit on error
                                mkdir -p uploads
                                echo "Stopping existing containers..."
                                docker-compose down --remove-orphans || true
                                
                                echo "Pulling new images..."
                                docker-compose pull
                                
                                echo "Starting services..."
                                docker-compose up -d
                                
                                # Verify deployment
                                echo "Waiting for services to start..."
                                sleep 10
                                
                                if ! docker ps --filter "name=${APP_NAME}" --format '{{.Names}} {{.Status}}' | grep -q 'Up (healthy)'; then
                                    echo "Backend health check failed"
                                    docker-compose logs backend
                                    exit 1
                                fi
                                
                                if ! curl -s http://localhost:3000 >/dev/null; then
                                    echo "Frontend check failed"
                                    docker-compose logs frontend
                                    exit 1
                                fi
                                
                                echo "Deployment successful!"
                            DEPLOY
                        """
                    }
                }
            }
        }
    }
    
    post {
        always {
            script {
                // Clean up Docker credentials
                sh 'docker logout || true'
                
                // Archive important logs
                archiveArtifacts artifacts: '**/*.log', allowEmptyArchive: true
                
                // Clean workspace
                cleanWs()
            }
        }
        
        success {
            slackSend(
                color: 'good',
                message: """SUCCESS: ${APP_NAME} deployed to ${EC2_IP}
                Backend: ${DOCKER_IMAGE_BACKEND}:${BUILD_TIMESTAMP}
                Frontend: ${DOCKER_IMAGE_FRONTEND}:${BUILD_TIMESTAMP}
                """
            )
        }
        
        failure {
            slackSend(
                color: 'danger',
                message: """FAILED: ${APP_NAME} deployment
                Build: ${BUILD_URL}
                Error: ${currentBuild.currentResult}
                """
            )
            
            // Attempt cleanup
            script {
                try {
                    sshagent([EC2_SSH_CREDS]) {
                        sh """
                            ssh -o StrictHostKeyChecking=no ubuntu@${EC2_IP} \
                            'docker-compose down || true'
                        """
                    }
                } catch (err) {
                    echo "Cleanup failed: ${err.message}"
                }
            }
        }
    }
}