class Location < ActiveRecord::Base

  belongs_to :company
  has_many :jobs
  belongs_to :address

end
