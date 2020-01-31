# frozen_string_literal: true

json.count (@candidates.count > @companies.count ? @candidates.count : @companies.count)
json.total_count (@candidates.count > @companies.count ? @candidates.total_entries : @companies.total_entries)
json.current_page (params[:page] ? params[:page].to_i : 1)
json.pages (@candidates.count > @companies.count ? @candidates.total_pages : @companies.total_pages)
json.companies do
  json.array!(@candidates) do |candidate|
    json.id candidate.id.to_s + '_Candidate'
    json.name candidate.full_name
    json.logo candidate.photo
  end
  json.array!(@companies) do |com|
    json.call(com, :name, :logo)
    json.id com.id.to_s + '_Company'
  end
end
