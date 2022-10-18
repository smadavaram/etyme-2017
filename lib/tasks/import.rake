# frozen_string_literal: true

require 'csv'

namespace :import do
  desc 'Import candidates from csv file'
  task candidate: :environment do
    puts 'Importing Candidates....'
    csv = File.open('lib/tasks/import_candidates_data.csv')
    already_exists_candidates = []
    imported_rows = 0
    total_rows = 0

    CSV.parse(csv, headers: true).each do |row|
      total_rows += 1

      if Candidate.find_by(email: row['email'])
        already_exists_candidates << row['email']
      else
        Candidate.create!(candidates_params(row.to_h))
        imported_rows += 1
      end
    end

    puts "#{imported_rows} out of #{total_rows} Candidates Imported Successfully !!"
    puts "These candidates already exists in database\n #{already_exists_candidates}" if already_exists_candidates.count.positive?
  end

  private

  def candidates_params(row)
    splited_name_array = row['name'].split(' ', 2)
    skill_list = row['skills'].split(' ')

    {
      first_name: splited_name_array.first,
      last_name: splited_name_array.last,
      email: row['email'],
      skill_list: skill_list,
      location: row['location'],
      phone: row['phone']
    }
  end
end
