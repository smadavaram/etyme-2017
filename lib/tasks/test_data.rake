# frozen_string_literal: true

namespace :test_data do
  desc 'Install test data'

  task :install_vendors, [:number] => [:environment] do |_task, args|
    disable_email_deliveries

    number_of_vendors = args.number || 4

    puts "Creating #{number_of_vendors} Vendors.."

    (1..(number_of_vendors.to_i)).each do |_number|
      domain = generate_domain
      puts "Creating Company with domain: #{domain}"
      company = Company.vendor.new(
        name: 'CloudEpa',
        domain: domain,
        website: "#{domain}.com"
      )

      email = generate_owner_email(domain)
      puts "Creating company owner with email: #{email}"
      company.build_owner(
        email: email,
        first_name: "Sharath#{random_number}",
        last_name: "Madavaram#{random_number}",
        password: '123456',
        password_confirmation: '123456',
        confirmed_at: Time.current
      )
      if company.save!
        puts 'Successfully Created company Owner.'
        puts '=' * 80
      end
    end
    puts 'Created vendors successfully!'
    enable_email_deliveries
  rescue ActiveRecord::RecordInvalid => e
    puts e.message
    enable_email_deliveries
  end

  task :install_candidates, [:number] => [:environment] do |_task, args|
    disable_email_deliveries

    if args.number
      puts "Creating #{args.number}..Candidates"
      number_of_candidates = args.number
    else
      puts 'Creating 100..Candidates'
      number_of_candidates = 99
    end

    (1..(number_of_candidates.to_i)).each do |_number|
      puts 'Creating candidate....'
      email = generate_candidate_email
      Candidate.create!(email: email,
                        confirmed_at: Time.current,
                        password: '123456',
                        password_confirmation: '123456',
                        send_welcome_email_to_candidate: false)
      puts "Successfully Created user with email: #{email}"
      puts '=' * 80
    end
    enable_email_deliveries
  rescue ActiveRecord::RecordInvalid => e
    puts e.message
    enable_email_deliveries
  end
end

def generate_domain
  loop do
    generated_domain = "cloudepa#{random_number}"
    break generated_domain unless Company.exists?(domain: generated_domain)
  end
end

def generate_candidate_email
  loop do
    generated_email = "smadavaram+#{random_number}@gmail.com"
    break generated_email unless Candidate.exists?(email: generated_email)
  end
end

def disable_email_deliveries
  puts '========DISABLE EMAIL DELIVERIES=============='
  ActionMailer::Base.perform_deliveries = false
end

def enable_email_deliveries
  puts '========ENABLE EMAIL DELIVERIES=============='
  ActionMailer::Base.perform_deliveries = true
end

def random_number
  rand(999_999_999)
end

def generate_owner_email(domain)
  loop do
    generated_email = "sadmin+#{random_number}@#{domain}.com"
    break generated_email unless Admin.exists?(email: generated_email)
  end
end
