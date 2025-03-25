pipeline {
    agent any
    
    environment {
        // ===== REQUIRED CONFIGURATION =====
        DOCKERHUB_REPO = 'sahilgupta2175'
        EC2_IP = '3.89.251.245'
        APP_NAME = 'mern-app'
        
        // ===== AUTOMATIC VARIABLES =====
        DOCKER_IMAGE_BACKEND = "${DOCKERHUB_REPO}/${APP_NAME}-backend"
        BUILD_TIMESTAMP = sh(script: 'date +%Y%m%d%H%M%S', returnStdout: true).trim()
        
        // ===== CREDENTIALS =====
        DOCKERHUB_CREDS = credentials('docker-hub-creds')
        EC2_SSH_CREDS = credentials('ec2-ssh-key')
        GITHUB_CREDS = credentials('github-creds')
    }
    
    options {
        timeout(time: 30, unit: 'MINUTES')
        retry(3)
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }
    
    stages {
        stage('Validate Environment') {
            steps {
                script {
                    echo "=== ENVIRONMENT VARIABLES ==="
                    echo "Docker Image: ${DOCKER_IMAGE_BACKEND}"
                    echo "EC2 Target: ${EC2_IP}"
                    
                    // Verify GitHub credentials
                    withCredentials([usernamePassword(
                        credentialsId: 'github-creds',
                        usernameVariable: 'GIT_USER',
                        passwordVariable: 'GIT_PASS'
                    )]) {
                        echo "GitHub credentials verified"
                    }
                    
                    // Test SSH connection using SSH key directly
                    withCredentials([sshUserPrivateKey(
                        credentialsId: 'ec2-ssh-key',
                        keyFileVariable: 'SSH_KEY'
                    )]) {
                        sh """
                            chmod 600 $SSH_KEY
                            ssh -o StrictHostKeyChecking=no -i $SSH_KEY ubuntu@${EC2_IP} 'echo "SSH connection successful"' || exit 1
                        """
                    }
                }
            }
        }
        
        stage('Checkout Code') {
            steps {
                checkout([
                    $class: 'GitSCM',
                    branches: [[name: 'main']],
                    extensions: [[$class: 'CloneOption', timeout: 10]],
                    userRemoteConfigs: [[
                        url: 'https://github.com/Sahilgupta2175/mern-backend.git',
                        credentialsId: 'github-creds'
                    ]]
                ])
            }
        }
        
        stage('Build Backend Image') {
            steps {
                script {
                    sh """
                        docker build \
                            --pull \
                            --no-cache \
                            -t ${DOCKER_IMAGE_BACKEND}:${BUILD_TIMESTAMP} \
                            -t ${DOCKER_IMAGE_BACKEND}:latest \
                            . 2>&1 | tee docker-build.log
                        
                        docker inspect ${DOCKER_IMAGE_BACKEND}:${BUILD_TIMESTAMP} >/dev/null 2>&1 || exit 1
                    """
                    archiveArtifacts artifacts: 'docker-build.log'
                }
            }
        }
        
        stage('Push to Docker Hub') {
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
                            echo \$DOCKER_PASS | docker login -u \$DOCKER_USER --password-stdin || exit 1
                            docker push ${DOCKER_IMAGE_BACKEND}:${BUILD_TIMESTAMP}
                            docker push ${DOCKER_IMAGE_BACKEND}:latest
                            docker logout
                        """
                    }
                }
            }
        }
        
        stage('Deploy to EC2') {
            steps {
                script {
                    def composeFile = """
                    version: '3.8'
                    services:
                      backend:
                        image: ${DOCKER_IMAGE_BACKEND}:latest
                        ports:
                          - "5000:5000"
                        restart: unless-stopped
                    """
                    
                    withCredentials([sshUserPrivateKey(
                        credentialsId: 'ec2-ssh-key',
                        keyFileVariable: 'SSH_KEY'
                    )]) {
                        sh """
                            cat << 'EOF' > docker-compose.yml
                            ${composeFile}
                            EOF
                            
                            scp -o StrictHostKeyChecking=no -i $SSH_KEY docker-compose.yml ubuntu@${EC2_IP}:~/
                            
                            ssh -o StrictHostKeyChecking=no -i $SSH_KEY ubuntu@${EC2_IP} << 'DEPLOY'
                                set -e
                                docker-compose down || true
                                docker-compose pull
                                docker-compose up -d
                                sleep 10
                                curl -s http://localhost:5000 >/dev/null || exit 1
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
                sh 'docker logout || true'
                cleanWs()
            }
        }
        success {
            echo "SUCCESS: ${env.APP_NAME} deployed to ${env.EC2_IP}"
        }
        failure {
            echo "FAILED: ${env.APP_NAME} deployment"
        }
    }
}