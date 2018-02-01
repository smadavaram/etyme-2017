# json.partial! 'company_list', companies: @companies

json.count @candidates.count
json.total_count @candidates.total_entries
json.current_page (params[:page] ? params[:page].to_i : 1)
json.pages @candidates.total_pages

json.companies(@candidates) do |candidate|
  json.id  candidate.applicationable.id
  json.name candidate.applicationable.full_name
  json.logo candidate.applicationable.photo
end