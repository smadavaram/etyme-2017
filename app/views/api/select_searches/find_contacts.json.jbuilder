json.count @contacts.count
json.total_count @contacts.total_entries
json.current_page (params[:page] ? params[:page].to_i : 1)
json.pages @contacts.total_pages

json.contacts(@contacts) do |contact|
  json.id  contact.id
  json.name contact.full_name
  json.email contact.email
  json.phone contact.phone
  json.department contact.department
end