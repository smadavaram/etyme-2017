# frozen_string_literal: true

json.count @users.count
json.total_count @users.count
json.current_page (params[:page] ? params[:page].to_i : 1)
json.pages @users&.total_pages

json.users(@users) do |user|
  json.id user.id
  json.full_name user.full_name
  json.email user.email
  json.phone user.phone
end
