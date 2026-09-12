# frozen_string_literal: true

json.count @users.count
json.total_count @users.total_entries
json.current_page params[:page] ? params[:page].to_i : 1
json.pages @users.total_pages

json.users(@users) do |contact|
  json.id contact.id
  json.full_name contact.full_name
  json.email contact.email
  json.phone contact.phone
end
