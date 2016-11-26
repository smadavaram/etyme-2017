class Package < ActiveRecord::Base

  #Associations
  has_many :subscriptions
  has_many :companies , through: :subscriptions

  #Call Backs
  before_create :set_slug

  def self.free
    find_by_slug('free')
  end

  def is_free?
    slug == 'free'
  end

  def is_paid?
    slug == 'paid'
  end

  def self.paid_plan
    find_by_slug('paid')
  end


  private

  # Call before create
  def set_slug
    self.slug = name.parameterize('-')
  end
end
