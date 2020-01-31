# frozen_string_literal: true

require 'csv'

desc 'This task is called For import data'
namespace :import_data do
  task contacts: :environment do
    puts "importing contacts...#{Time.now}"
    user = User.where(email: 'madhuri@cloudepa.com').first
    # user = User.where(email: 'mounika@cloudepa.com').first

    csv_text = File.read('public/Vendor_List.csv')
    csv = CSV.parse(csv_text, headers: true)
    csv.each do |row|
      email_array = row['Email'].downcase.split('@')

      User.where(email: row['Email'].downcase).destroy_all
      com = Company.where('domain = ? OR slug = ?', email_array[1], email_array[1].split('.')[0]).first

      if com.present?
        com.assign_attributes(
          company_contacts_attributes: {
            '1525841782490' => {
              first_name: 'No Name',
              last_name: 'No Name',
              email: row['Email'].downcase
            }
          }
        )
      else
        com = Company.new(
          name: email_array[1],
          domain: email_array[1],
          email: row['Email'].downcase,
          company_type: 'vendor',
          invited_by_attributes: {
            user_id: user.id,
            invited_by_company_id: user.company_id
          },
          company_contacts_attributes: {
            '1525841782490' => {
              first_name: 'No Name',
              last_name: 'No Name',
              email: row['Email'].downcase
            }
          }
        )
      end

      com.save
      puts com.errors.full_messages
      sleep 1
    end

    puts "done.#{Time.now}"
  end

  def get_uniq_identifier
    o = [('a'..'z'), ('A'..'Z'), (0..9)].map(&:to_a).flatten
    string = (0...15).map { o[rand(o.length)] }.join
    Digest::MD5.hexdigest(string)
  end
end
