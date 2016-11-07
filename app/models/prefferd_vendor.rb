# == Schema Information
#
# Table name: prefferd_vendors
#
#  company_id :integer
#  vendor_id  :integer
#  status     :boolean          default(FALSE)
#  created_at :datetime         not null
#  updated_at :datetime         not null
#
# Indexes
#
#  index_prefferd_vendors_on_company_id  (company_id)
#  index_prefferd_vendors_on_vendor_id   (vendor_id)
#

class PrefferdVendor < ActiveRecord::Base
  belongs_to :company
  belongs_to :vendor
end
