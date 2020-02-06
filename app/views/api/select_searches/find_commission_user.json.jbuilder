# frozen_string_literal: true

json.count @commission_users.count
json.total_count @commission_users.total_entries
json.current_page (params[:page] ? params[:page].to_i : 1)
json.pages @commission_users.total_pages

json.companies(@commission_users) do |cu|
  json.id cu.id.to_s + '_Admin'
  json.name cu.full_name
end
