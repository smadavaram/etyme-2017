# **ETyme** #
### Ruby version ###
     * 2.4.2

###  Rails version ###
     * 5.1.2

###  Configuration ###
     Super Admin: ActiveAdmin
     Authentication: Devise
     Database: postgresql
     Markup Language: HAML

###  Database ###
     * postgresql

###  Development Environment Setup ###
Copy config/database.yml.example to config/database.yml file. Make necessary changes if required to setup your local environment. Create database, run the migrations and load seed data, then start rails server, with following commands:

    $> rails db:create && rails db:migrate && rails db:seed
    $> rails s

Open application in browser ```http://lvh.me:3000``` and login as a company.

**Test Company User:**``

    User: hradmin@cloudepa.com
    Pass: testing1234

### **Deployment Instructions** ###

***Staging ENV.***

1- Create a PR of your branch with production branch 'deploy-staging'

2- Merge your PR.

3- We use capistrano script for AWS deployments.

4- Checkout locally in branch deploy-staging.

5- Check the capistrano config present in deploy.rb and 'config/deploy/staging.rb'

6- Either use your ssh keys or pem files for authentication.

7- Once everything looks okay, check the deployment steps using command - $cap staging deploy --dry-run

8- After verification in step 7 run actual command to deploy the code $ cap staging deploy

9- IP Address of Staging - 3.128.51.36


***Production ENV.***

1- Create a PR of your branch with production branch 'deploy-prod'

2- Merge your PR.

3- We use capistrano script for AWS deployments.

4- Checkout locally in branch deploy-prod.

5- Check the capistrano config present in deploy.rb and 'config/deploy/production.rb'

6- Either use your ssh keys or pem files for authentication.

7- Once everything looks okay, check the deployment steps using command -  *cap production deploy --dry-run*

8- After verification in step 7 run actual command to deploy the code - *cap production deploy*

9- IP Address of Staging - 3.135.117.131
