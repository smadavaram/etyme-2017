# frozen_string_literal: true

require 'csv'

namespace :import do
  desc 'Import candidates from csv file'
  task candidate: :environment do
    puts 'Importing Candidates....'

    csv = File.open('lib/tasks/import_candidates_data.csv')
    imported_candidates = []
    not_imported_candidates = []
    imported_rows = 0
    total_rows = 0

    CSV.parse(csv, headers: true).each do |row|
      total_rows += 1

      if Candidate.find_by(email: row['email'])
        not_imported_candidates << not_imported_candidates_attributes(row,  "Already exists")
      else
        candidate = Candidate.new(candidates_params(row.to_h))
        candidate.skip_confirmation!
        candidate.send_welcome_email_to_candidate = true
        candidate.save

        if candidate.errors.any?
          not_imported_candidates << not_imported_candidates_attributes(row, candidate.errors.full_messages)
        else
          imported_rows += 1
          imported_candidates << imported_candidates_attributes(row)
        end
      end

      puts "#{total_rows} rows scanned"
    end

    puts "#{imported_rows} out of #{total_rows} Candidates Imported Successfully !!"
    if not_imported_candidates.count.positive?
      puts "These are the logs"
      not_imported_candidates.each do |row|
        puts row
      end
    end
    generate_csv(imported_candidates, "valid_candidates")
    generate_csv(not_imported_candidates, "invalid_candidates")
  end

  private

  def candidates_params(row)
    splited_name_array = row['name']&.split(' ', 2) || []
    skill_list = row['skills']&.split(';')&.first(8) || []
    phone = Phonelib.parse(row['phone'])
    phone_number = phone.national_number == "N/A" ? nil : phone.national_number
    phone_country_code = phone.country_code || (phone_number.nil? ? nil : "+1")

    {
      first_name: splited_name_array.first,
      last_name: splited_name_array.last,
      email: row['email'],
      skill_list: skill_list,
      location: row['location'],
      phone: phone_number,
      phone_country_code: phone_country_code,
      password: row['email'],
      password_confirmation: row['email']
    }
  end

  def not_imported_candidates_attributes(row, error)
    error = error.join("; ") if error.is_a?(Array)
    not_imported = imported_candidates_attributes(row) 
    not_imported[:error] = error
    not_imported
  end

  def imported_candidates_attributes(row)
    {
      name: row['name'],
      phone: row['phone'],
      email: row['email'],
      skill_list: row['skills'],
      location: row['location']
    }
  end

  def generate_csv(data, file_name)
    generate_empty_file(file_name) and return if data.empty?

    CSV.open("lib/tasks/#{file_name}.csv", "wb", {headers: data.first.keys} ) do |csv|
      csv << data.first.keys
      data.each do |hash|
        csv << hash
      end
    end
  end

  def generate_empty_file(file_name)
    CSV.open("lib/tasks/#{file_name}.csv", "wb") do |csv|
      if file_name == "valid_candidates"
        csv << ["name", "phone", "email", "skills", "locations"]
      else
        csv << ["name", "phone", "email", "skills", "locations"]
      end
    end
  end
end
