class InvitedCompany < ActiveRecord::Base

  belongs_to :invited_by         ,class_name: "Company"        , foreign_key: "invited_by_company_id"
  belongs_to :invited_company    ,class_name: "Company"        , foreign_key: "invited_company_id"
end
