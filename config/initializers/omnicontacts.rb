require "omnicontacts"

Rails.application.middleware.use OmniContacts::Builder do
  importer :gmail, ENV['GMAIL_CLIENT_ID'], ENV['GMAIL_CLIENT_SECRET'], {:redirect_path => "/contacts/gmail/import_contacts"}
  importer :yahoo, ENV['YAHOO_CLIENT_ID'], ENV['YAHOO_CLIENT_SECRET'], {:callback_path => "/contacts/yahoo/import_contacts"}
  importer :linkedin, "consumer_id", "consumer_secret", {:redirect_path => "/oauth2callback", :state => '<long_unique_string_value>'}
  importer :hotmail, "client_id", "client_secret"
  importer :outlook, ENV['OUTLOOK_CLIENT_ID'], ENV['OUTLOOK_CLIENT_SECRET']
  importer :facebook, "client_id", "client_secret"
end
