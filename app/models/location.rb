class Location < ActiveRecord::Base

  # Association
  belongs_to  :company
  has_many    :jobs
  belongs_to  :address

  #Validation
  validates :name , presence: true


  # Nested Attributes
  accepts_nested_attributes_for :address, allow_destroy: true ,reject_if: :all_blank

end
