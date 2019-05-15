class AddConfirmationToDesignations < ActiveRecord::Migration[5.1]
  def change
    Designation.where(status: "Self Employee").update_all(status:"Freelancer")
    add_column :designations, :confirmation,:int, default: 0
  end
end
