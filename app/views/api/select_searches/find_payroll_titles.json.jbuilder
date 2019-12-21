#json.count @titles.count
#json.total_count @titles.count
#json.current_page (params[:page] ? params[:page].to_i : 1)
#json.pages @titles&.total_pages

json.users(@users) do |user|
  json.id  user.id

end