# Use this file to easily define all of your cron jobs.
#
# It's helpful, but not entirely necessary to understand cron before proceeding.
# http://en.wikipedia.org/wiki/Cron

# Example:
#
# set :output, "/path/to/my/cron_log.log"
#
# every 2.hours do
#   command "/usr/bin/some_great_command"
#   runner "MyModel.some_method"
#   rake "some:great:rake:task"
# end
#

set :output, '/var/www/etyme/shared/log/cron.log'

every 1.day, :at => '11:59 pm' do
  runner "Contract.end_contracts"
end

every 1.day, :at => '11:59 pm' do
  runner "Contract.start_contracts"
end

every 1.day, :at => '11:59 pm' do
  runner "Contract.invoiced_timesheets"
end

every 1.day, :at => '12:01 am' do
  runner "Contract.set_cycle"
end

# Learn more: http://github.com/javan/whenever
