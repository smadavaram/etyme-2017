# frozen_string_literal: true

require 'csv'

namespace :import do
  desc 'Import candidates from csv file'
  task candidate: :environment do
    puts 'Importing Candidates....'
    csv = File.open('lib/tasks/import_candidates_data.csv')
    not_imported_candidates = {}
    imported_rows = 0
    total_rows = 0

    CSV.parse(csv, headers: true).each do |row|
      total_rows += 1

      if Candidate.find_by(email: row['email'])
        not_imported_candidates[row['email']] = "Already exists"
      else
        candidate = Candidate.new(candidates_params(row.to_h))
        candidate.skip_confirmation!
        candidate.send_welcome_email_to_candidate = true
        candidate.save

        if candidate.errors.any?
          not_imported_candidates[row['email']] = candidate.errors.full_messages
        else
          imported_rows += 1
        end
      end
    end

    puts "#{imported_rows} out of #{total_rows} Candidates Imported Successfully !!"
    puts "These candidates already exists in database\n #{not_imported_candidates}" if not_imported_candidates.count.positive?
  end

  private

  def candidates_params(row)
    splited_name_array = row['name'].split(' ', 2)
    skill_list = row['skills'].split(' ')
    phone = Phonelib.parse(row['phone'])
    phone_number = phone.national_number
    phone_country_code = phone.country_code || "+1"

    {
      first_name: splited_name_array.first,
      last_name: splited_name_array.last,
      email: row['email'],
      skill_list: skill_list,
      location: row['location'],
      phone: phone_number,
      phone_country_code: phone_country_code
    }
  end
end
