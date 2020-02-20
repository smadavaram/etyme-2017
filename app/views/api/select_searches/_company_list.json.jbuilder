# frozen_string_literal: true

json.count companies.count
json.total_count companies.total_entries
json.current_page params[:page] ? params[:page].to_i : 1
json.pages companies.total_pages

json.companies(companies) do |com|
  json.call(com, :name, :id, :logo)
end
