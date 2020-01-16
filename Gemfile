
#****************************
# Paper Trail history maintain
#****************************
gem 'paper_trail'
#****************************
# Configuration
#****************************
ruby '2.4.2'
source 'https://rubygems.org'
gem 'rails', '5.1.2'
gem 'best_in_place'
gem 'signature-pad-rails'
gem 'mina' #,'~> 0.2.1'
gem 'mina-multistage'#, '<= 1.0.1', require: false
# gem 'mina-puma', :require => false
gem 'puma'
gem 'browser-timezone-rails'
#****************************
# Javascript Configuration
#****************************
gem 'coffee-rails'#, '~> 4.1.0'
gem 'jquery-rails'
gem 'jquery-ui-rails'
gem 'pusher'

#****************************
# Layout & Rendering
#****************************
gem 'sass-rails', '~> 5.0'
gem 'uglifier', '>= 1.3.0'
# gem 'turbolinks'
gem 'jbuilder', '~> 2.5'
gem 'sdoc'#, '~> 0.4.0', group: :doc
gem 'simple_form'
gem "haml-rails"#, "~> 0.9"
gem 'font-awesome-rails'
gem 'cocoon'
gem 'city-state'
gem 'tinymce-rails'
gem 'data-confirm-modal'
gem 'wicked_pdf'
gem 'wkhtmltopdf-binary'
gem 'breadcrumbs_on_rails'
gem 'public_activity'
#ajax data tables
gem 'ajax-datatables-rails'



#****************************
# BulletTrain
#****************************
# BulletTrain: "bootstrap and other ui stuff."
gem 'bootstrap', '~> 4.0.0'
gem 'popper_js', '~> 1.12.9'
source 'https://rails-assets.org' do
  # this is for bootstrap's tooltip positioning.
  gem 'rails-assets-tether', '>= 1.1.0'
  gem 'rails-assets-jsTimezoneDetect'
end
# Bullettrain uses this to detect the size of the logo assets.
gem 'fastimage'

gem 'ancestry'
gem 'rails-jquery-autocomplete'
#****************************
# DataBase
#****************************
gem 'pg', '~> 0.18'
gem 'rails_12factor', group: :production

#****************************
# Mailer
#****************************
gem 'mailgun_rails'

#****************************
# Pagination
#****************************
gem 'will_paginate'#, '~> 3.1'

#****************************
# Tagging
#****************************
gem 'acts-as-taggable-on'#, '~> 4.0'

#****************************
# Authentication & Validations
#****************************
gem 'devise'
gem 'devise_invitable'#, '~> 1.7.0'
# gem 'activeadmin'
gem 'validates_timeliness'#, '~> 4.0'
gem 'date_validator'
gem 'ruby-duration'#, '~> 3.2', '>= 3.2.1'
gem "bootstrap_form"

#****************************
# social signup & signin
#****************************
gem 'omniauth'
# gem 'omniauth-linkedin'
gem 'omniauth-linkedin-oauth2'
gem 'omniauth-facebook'
gem 'omniauth-google-oauth2'

#****************************
# CronJobs
#****************************
gem 'whenever', :require => false
gem 'delayed_job_active_record'#, '4.0.3'
gem 'daemons'

#****************************
# Searching
#****************************
gem 'ransack'#, '~> 1.7'
gem 'has_scope'

# gem 'therubyracer', platforms: :ruby

# gem 'paperclip'

gem 'figaro'


#****************************
# Multimedia Files
#****************************
gem 'filepicker-rails'
gem 'carrierwave'
gem 'mini_magick'
gem 'roo'
# gem 'fog'

gem 'awesome_print'


# Use ActiveModel has_secure_password
# gem 'bcrypt', '~> 3.1.7'
#****************************
# Featureing Files
#****************************

gem "paranoia"#, "~> 2.2"
# Use Unicorn as the app server
# gem 'unicorn'

# Use Capistrano for deployment
# gem 'capistrano-rails', group: :development
gem "googleauth"
gem "geocoder"
group :development, :test do
# Gem rbnacl-libsodium should be placed before then gem rbnacl else sodium pkg error may occour
  gem 'rbnacl-libsodium'
  gem 'rbnacl','< 5.0'
  gem 'bcrypt_pbkdf', '< 2.0'
  gem 'ed25519', '< 2.0'
  gem 'better_errors'#, '~> 1.1.0'
  gem 'binding_of_caller'
  gem 'rails-erd'
  gem 'test-unit'
  gem 'letter_opener', '1.4.1'
  gem 'byebug'
  gem 'pry'
  gem 'hirb'#, '~> 0.7.3'
  gem 'annotate'#, '~> 2.7'
  gem 'listen', '>= 3.0.5', '< 3.2'
  # Access an IRB console on exception pages or by using <%= console %> in views
  gem 'web-console', '>= 3.3.0'
  # Spring speeds up development by keeping your application running in the background. Read more: https://github.com/rails/spring
  gem 'spring'
  gem 'spring-watcher-listen', '~> 2.0.0'
  gem 'bullet'
  #Capistrano Deployment
  gem 'capistrano', ' 3.11.0'
  gem 'capistrano-bundler'
  gem 'capistrano-rvm'
  gem 'capistrano-passenger', '>= 0.1.1'

  # Remove the following if your app does not use Rails
  gem 'capistrano-rails'

  # Remove the following if your server does not use RVM

end

gem 'redis', '~> 3.3.3'
gem "select2-rails", '~> 3.5.9.1'
gem 'mini_racer' # changed from therubyracer, since Bullettrain (or one of its dependencies) requires mini_racer

# gem 'sequence-sdk', '~> 1.5', require: 'sequence'
gem 'sequence-sdk'

gem 'facebook-account-kit'

gem 'nokogiri'

gem 'markio'

gem 'nested_form_fields'


gem 'fullcalendar-rails'
gem 'momentjs-rails'

gem 'holidays'

#****************
# API libs
#****************
gem 'rack-cors', :require => 'rack/cors'

# *************************
# omni auth for docusign
# *************************

gem 'omniauth-oauth2'
gem 'docusign_esign'
# gem 'bucket_client'
gem 'aws-sdk', '~> 3'
gem 'hashie'
gem 'chronic'

# gem 'trix',  '1.2.0'
gem 'trix-rails', '~> 2.2', require: 'trix'
gem 'exception_notification'
gem 'capistrano3-delayed-job', '~> 1.0'
