# frozen_string_literal: true

json.count @resumes.count
json.total_count @resumes.count
json.current_page params[:page] ? params[:page].to_i : 1
json.pages @resumes.total_pages

index = 1
json.resumes(@resumes) do |resume|
  json.id resume.id
  json.resume resume.resume
  json.name "Resume #{index} #{resume.is_primary ? '(Default)' : ''}" 
  index = index + 1
end
