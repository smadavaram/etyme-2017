class PreferVendor < ActiveRecord::Base
  enum status: [:pending, :accepted ,:rejected]

  belongs_to :company
  belongs_to :prefer_vendor, class_name: "Company",foreign_key: 'vendor_id'

  attr_accessor :company_ids

  after_create  :send_notifcation_to_vendor
  after_update  :send_notifcation_to_companies ,if: Proc.new{ |vendor| vendor.status_changed?}


  def send_notifcation_to_vendor
   self.prefer_vendor.owner.notifications.create(title:"Company Network Request",message:self.company.name + " has requested to add you in his company network")
  end

  def send_notifcation_to_companies
    self.company.owner.notifications.create(title:"Status on Network Request",message:self.prefer_vendor.name + " has #{self.status} to your request for Company Network")
  end


  def already_invited(c)
    PreferVendor.where(company_id: c.id)
  end

end
