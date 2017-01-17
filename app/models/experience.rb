class Experience < ActiveRecord::Base

  validates :experience_title , presence: true
  validates :start_date ,  presence: true
  validates :end_date , presence: true
  validate  :end_date_is_greater_than_start_date

  belongs_to :candidate  , class_name:  "Candidate" ,foreign_key: 'user_id'

  private

    def end_date_is_greater_than_start_date
      if self.end_date < self.start_date
        errors.add(:end_date," should be greater than start date")
        return false
      else
        return true
      end

    end

end
