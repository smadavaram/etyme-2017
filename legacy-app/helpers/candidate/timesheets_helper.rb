# frozen_string_literal: true

module Candidate::TimesheetsHelper
  def get_day_transaction(day, transactions)
    day_method = { 0 => 'monday?', 1 => 'tuesday?', 2 => 'wednesday?',
                   3 => 'thursday?', 4 => 'friday?', 5 => 'saturday?', 6 => 'sunday?' }
    transactions.find { |transaction| transaction.start_time.send(day_method[day]) }
  end
end
