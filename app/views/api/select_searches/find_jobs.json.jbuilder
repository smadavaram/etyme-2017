# frozen_string_literal: true

json.count @jobs.count
json.total_count @jobs.total_entries
json.current_page params[:page] ? params[:page].to_i : 1
json.pages @jobs.total_pages

json.companies(@jobs) do |job|
  json.id job.id
  json.name job.title
end
