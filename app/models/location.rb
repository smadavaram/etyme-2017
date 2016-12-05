class Location < ActiveRecord::Base

  #Validation
  validates :name , presence: true

  # Association
  belongs_to  :company
  has_many    :jobs
  belongs_to  :address



  # Nested Attributes
  accepts_nested_attributes_for :address, allow_destroy: true ,reject_if: :all_blank

end
