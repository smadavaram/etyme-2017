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

**Test Company User:**

    User: hradmin@cloudepa.com
    Pass: testing1234
