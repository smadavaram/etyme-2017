# frozen_string_literal: true

desc 'This task is called by the Heroku scheduler add-on'
task end_contracts: :environment do
  puts 'Ending contracts...'
  Contract.end_contracts
  puts 'done.'
end

task start_contracts: :environment do
  puts 'Starting contracts...'
  Contract.start_contracts
  puts 'done.'
end

task invoiced_contracts: :environment do
  puts 'Timesheet contracts...'
  Contract.invoiced_timesheets
  puts 'done.'
end

task cycle: :environement do
  puts 'Cycle contracts...'
  Contract.set_cycle
  puts 'done.'
end
