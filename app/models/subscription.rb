class Subscription < ActiveRecord::Base

  belongs_to :package
  belongs_to :company

end
