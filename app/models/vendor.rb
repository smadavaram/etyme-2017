class Vendor < User

  has_many :prefferd_vendors
  has_many :companies, through: :prefferd_vendors
  has_many :job_invitations , as: :receipent

end
