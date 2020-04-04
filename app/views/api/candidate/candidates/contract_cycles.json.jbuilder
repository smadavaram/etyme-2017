json.array! cycles do |cycle|
  json.id  cycle.id
  json.range "#{cycle.start_date.strftime("%Y-%m-%d")} - #{cycle.end_date.strftime("%Y-%m-%d")}"
end