class Invoice < ActiveRecord::Base
  belongs_to  :contract
  has_many    :timesheets
  has_many    :timesheet_logs , through: :timesheets
  has_one     :company        , through: :company
end
