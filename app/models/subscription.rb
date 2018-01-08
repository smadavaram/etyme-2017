class Subscription < ApplicationRecord

  belongs_to :package, optional: true
  belongs_to :company, optional: true

end
