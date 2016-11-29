class Subscription < ActiveRecord::Base

  #Associations
  belongs_to :package
  belongs_to :company

end
