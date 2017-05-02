module Company::PreferVendorsHelper
  def already_prefered?(c_id,vendor_id)
    PreferVendor.accepted.where( "(company_id= :c_id and vendor_id= :vendor_id) or (company_id= :vendor_id and vendor_id= :c_id )" , {c_id: c_id,vendor_id:vendor_id}).present?
  end
end
