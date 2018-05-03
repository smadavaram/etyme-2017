require 'csv'

desc "This task is called For import data"
namespace :import_data do
  task contacts: :environment do
    puts "importing contacts..."

    company = Company.where(name: 'Cloudepa').first

    csv_text = File.read('public/Vendor_List.csv')
    csv = CSV.parse(csv_text, :headers => true)
    csv.each do |row|
      cc = company.company_contacts.create(email: row['Email'].downcase)
      puts cc.errors.full_messages
    end
    puts "done."
  end
end