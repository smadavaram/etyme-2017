# frozen_string_literal: true

namespace :matcher do
    desc 'Find Matches between candidates and jobs'
    task find_all: :environment do
      puts 'Starting....'
      jobs = Job.where(listing_type: 'Job', status: 'Published')
      count = total_count = jobs.count

      jobs.each do |job|
         puts "remaining #{count} out of #{total_count}"
         job.matched_candidates
         count -= 1
      end
    end
  end
  