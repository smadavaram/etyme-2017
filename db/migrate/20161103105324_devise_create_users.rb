class DeviseCreateUsers < ActiveRecord::Migration
  def change
    create_table :devise do |t|
      ## Database authenticatable
      t.string  :first_name , default: ""
      t.string  :last_name , default: ""
      t.boolean :gender
      t.string  :email,              null: false, default: ""
      t.string  :type
      t.string  :phone
      t.string  :country
      t.string  :state
      t.string  :city
      t.string  :zip_code
      t.string  :photo
      t.boolean :status

      t.string :encrypted_password, null: false, default: ""

      ## Recoverable
      t.string   :reset_password_token
      t.datetime :reset_password_sent_at

      ## Rememberable
      t.datetime :remember_created_at

      ## Trackable
      t.integer  :sign_in_count, default: 0, null: false
      t.datetime :current_sign_in_at
      t.datetime :last_sign_in_at
      t.string   :current_sign_in_ip
      t.string   :last_sign_in_ip

      # Confirmable
      t.string   :confirmation_token
      t.datetime :confirmed_at
      t.datetime :confirmation_sent_at
      t.string   :unconfirmed_email # Only if using reconfirmable

      ## Lockable
      # t.integer  :failed_attempts, default: 0, null: false # Only if lock strategy is :failed_attempts
      # t.string   :unlock_token # Only if unlock strategy is :email or :both
      # t.datetime :locked_at


      t.timestamps null: false
    end

    add_index :devise, :email,                unique: true
    add_index :devise, :reset_password_token, unique: true
    add_index :devise, :confirmation_token,   unique: true
    # add_index :devise, :unlock_token,         unique: true
  end
end
