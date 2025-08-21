class AddRequiredToCustomFields < ActiveRecord::Migration[4.2]
  def change
    add_column :custom_fields, :required, :boolean,default: false
  end
end
