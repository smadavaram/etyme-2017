json.count @candidates.count
json.total_count @candidates.total_entries
json.current_page (params[:page] ? params[:page].to_i : 1)
json.pages @candidates.total_pages

json.companies(@candidates) do |candidate|
  json.id  candidate.id
  json.name candidate.full_name
  json.logo candidate.photo
end