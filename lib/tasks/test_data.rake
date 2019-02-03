namespace :test_data do
  desc "Install test data"

  task :install_vendors, [:number] => [:environment] do |task, args|

    if args.number
      number_of_vendors = args.number
    else
      number_of_vendors = 4
    end

    puts "Creating #{number_of_vendors} Vendors.."

    (1..(number_of_vendors.to_i)).each do |number|

      random_number = rand(1000)
      domain = "cloudepa#{random_number}"

      puts "Creating Company with domain: #{domain}"
      company = Company.vendor.new(
                                    name: 'CloudEpa',
                                    domain: domain,
                                    website: "#{domain}.com"
                                  )

      email = "sadmin+#{random_number}@#{domain}.com"
      puts "Creating company owner with email: #{email}"
      company.build_owner(
                          email: email,
                          first_name: "Sharath#{random_number}",
                          last_name: "Madavaram#{random_number}",
                          password: '123456',
                          password_confirmation: '123456'
                          )
      if company.save!
        puts 'Successfully Created company Owner.'
        puts '=' * 80
      end

    end
    puts "Created vendors successfully!"

  end

  task :install_candidates, [:number] => [:environment] do |task, args|

    if args.number
      puts "Creating #{args.number}..Candidates"
      number_of_candidates = args.number
    else
      puts "Creating 100..Candidates"
      number_of_candidates = 99
    end

    (1..(number_of_candidates.to_i)).each do |number|
      random_number = rand(1000)

      email = "smadavaram+#{random_number}@gmail.com"

      puts "Creating user with email: #{email}"
      Candidate.create!(email: email,
                        confirmed_at: Time.current,
                        password: '123456',
                        password_confirmation: '123456',
                        send_welcome_email_to_candidate: false
                      )
      puts "Successfully Created user with email: #{email}"
      puts '=' * 80
    end

  end

end
