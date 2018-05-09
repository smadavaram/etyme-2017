require 'csv'

desc "This task is called For import data"
namespace :import_data do
  task contacts: :environment do
    puts "importing contacts...#{Time.now}"
    user = User.where(email: 'madhuri@cloudepa.com').first

    Company.where("created_at >= '2018-05-08 00:00' AND created_at < '2018-05-9 00:00'").destroy_all

    csv_text = File.read('public/Vendor_List.csv')
    csv = CSV.parse(csv_text, :headers => true)
    csv.each do |row|
      email_array = row['Email'].downcase.split('@')
      pass = get_uniq_identifier

      com = Company.new(
                        name: email_array[1],
                        domain: email_array[1],
                        email: row['Email'].downcase,
                        company_type: "vendor",
                        invited_by_attributes: {
                            user_id: user.id,
                            invited_by_company_id: user.company_id
                        },
                        owner_attributes: {
                            email: row['Email'].downcase,
                            password: pass,
                            password_confirmation: pass,
                            temp_pass: pass
                        },
                        company_contacts_attributes: {
                            "1525841782490" => {
                                first_name: "No Name",
                                last_name: "No Name",
                                email: row['Email'].downcase
                            }
                        }
                      )
      com.save
      puts com.errors.full_messages
      sleep 1
    end
    puts "done.#{Time.now}"
  end

  def get_uniq_identifier
    o = [('a'..'z'), ('A'..'Z'),(0..9)].map { |i| i.to_a }.flatten
    string = (0...15).map { o[rand(o.length)] }.join
    return Digest::MD5.hexdigest(string)
  end
end