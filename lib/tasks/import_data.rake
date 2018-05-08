require 'csv'

desc "This task is called For import data"
namespace :import_data do
  task contacts: :environment do
    puts "importing contacts...#{Time.now}"
    user = User.where(email: 'madhuri@cloudepa.com').first

    csv_text = File.read('public/Vendor_List.csv')
    csv = CSV.parse(csv_text, :headers => true)
    csv.each do |row|
      email_array = row['Email'].downcase.split('@')
      name = (['aj', 'hr'].include?(email_array[0]) ? email_array[0]+email_array[0] : email_array[0])
      com = Company.new(
                        name: name,
                        domain: email_array[1],
                        email: row['Email'].downcase,
                        invited_by_attributes: {
                            user_id: user.id,
                            invited_by_company_id: user.company_id
                        }
                      )
      com.save
      puts com.errors.full_messages
      sleep 1
    end
    puts "done.#{Time.now}"
  end
end