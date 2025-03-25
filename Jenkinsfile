pipeline {
    agent any

    environment {
        DOCKERHUB_CREDENTIALS = credentials('docker-hub-creds')
        DOCKER_IMAGE_BACKEND = 'sahilgupta2106/mern-backend'
        DOCKER_IMAGE_FRONTEND = 'sahilgupta2106/mern-frontend'
    }

    stages {
        stage('Checkout Code') {
            steps {
                git 'https://github.com/sahilgupta2175/mern-backend.git'
                dir('frontend') {
                    git 'https://github.com/sahilgupta2106/mern-frontend.git'
                }
            }
        }

        stage('Build Backend Image') {
            steps {
                dir('backend') {
                    sh 'docker build -t ${DOCKER_IMAGE_BACKEND}:latest .'
                }
            }
        }

        stage('Build Frontend Image') {
            steps {
                dir('frontend') {
                    sh 'docker build -t ${DOCKER_IMAGE_FRONTEND}:latest .'
                }
            }
        }

        stage('Push to Docker Hub') {
            steps {
                sh "echo ${DOCKERHUB_CREDENTIALS_PSW} | docker login -u ${DOCKERHUB_CREDENTIALS_USR} --password-stdin"
                sh "docker push ${DOCKER_IMAGE_BACKEND}:latest"
                sh "docker push ${DOCKER_IMAGE_FRONTEND}:latest"
            }
        }

        stage('Deploy on EC2') {
            steps {
                sshagent(['ec2-ssh-key']) {
                    sh """
                        ssh -o StrictHostKeyChecking=no ubuntu@3.89.251.245 << EOF
                        docker pull ${DOCKER_IMAGE_BACKEND}:latest
                        docker pull ${DOCKER_IMAGE_FRONTEND}:latest
                        docker-compose down || true
                        docker-compose up -d
                        EOF
                    """
                }
            }
        }
    }

    post {
        always {
            sh 'docker logout'
        }
    }
}