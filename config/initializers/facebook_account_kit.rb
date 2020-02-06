# frozen_string_literal: true

require 'facebook/account_kit'

Facebook::AccountKit.config do |c|
  c.account_kit_version = 'v1.1' # or any other valid account kit api version
  c.account_kit_app_secret = '06bc341bc92a82c7a1e179024e765532'
  c.facebook_app_id = '1209424855859249'
end
