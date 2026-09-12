class DesignationProject < ActiveRecord::Base
  belongs_to :designation
  
  def formatted_date
    [start_date&.strftime('%B-%Y'), end_date&.strftime('%B-%Y')].join("-")
  end
  
end