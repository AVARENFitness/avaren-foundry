export const AVAREN_LIABILITY_WAIVER_VERSION = '1.0'

export const AVAREN_LIABILITY_WAIVER_TITLE =
  'AVAREN Personal Training Liability Waiver & Assumption of Risk'

/**
 * Draft business waiver for AVAREN personal training.
 *
 * IMPORTANT: This wording is a working template for product setup and should
 * be reviewed by qualified legal counsel before AVAREN relies on it as a final
 * legal document.
 */
export const AVAREN_LIABILITY_WAIVER_TEXT = `
AVAREN PERSONAL TRAINING LIABILITY WAIVER & ASSUMPTION OF RISK

PLEASE READ CAREFULLY BEFORE SIGNING.

By signing this document, I acknowledge that I am voluntarily participating in personal training, fitness coaching, exercise programming, strength training, conditioning, mobility work, nutritional guidance, recovery guidance, and other related fitness activities provided by AVAREN, whether delivered in person, online, remotely, or through the AVAREN platform.

1. VOLUNTARY PARTICIPATION

I understand that my participation in AVAREN training and coaching services is voluntary. I may stop an exercise, session, or program at any time if I feel pain, dizziness, unusual shortness of breath, illness, discomfort, or any other concerning symptom.

2. HEALTH AND MEDICAL RESPONSIBILITY

I understand that physical exercise can be strenuous and is not appropriate for every person. I represent that, to the best of my knowledge, I am physically able to participate in the activities I choose to perform.

I understand that AVAREN and its trainers do not diagnose medical conditions, prescribe medical treatment, or replace care from a physician or other qualified healthcare professional. I am responsible for seeking medical clearance when appropriate and for informing my trainer about injuries, medical conditions, medications, physical limitations, pregnancy, recent surgeries, or other information that may affect my ability to exercise safely.

I agree to follow reasonable safety instructions and to communicate promptly if an exercise causes pain, unusual discomfort, or other concerning symptoms.

3. ASSUMPTION OF RISK

I understand that participation in exercise and fitness activities involves inherent and foreseeable risks, including but not limited to muscle soreness, strains, sprains, falls, fractures, joint injuries, overexertion, dizziness, fainting, cardiovascular events, equipment-related injuries, aggravation of existing conditions, and, in rare cases, serious injury, disability, or death.

I understand that these risks may occur even when reasonable care is used. I knowingly and voluntarily accept and assume the risks associated with my participation in AVAREN training, coaching, programming, and related fitness activities.

4. RELEASE AND WAIVER OF LIABILITY

To the fullest extent permitted by applicable law, I release and hold harmless AVAREN, its owners, trainers, employees, contractors, agents, representatives, affiliated facilities, and business partners from claims, demands, causes of action, damages, losses, or expenses arising out of or related to my voluntary participation in AVAREN training or fitness activities, including claims arising from ordinary negligence.

This release does not apply to conduct that cannot legally be waived under applicable law.

5. ONLINE AND REMOTE TRAINING

If I participate in online, remote, or self-directed programming, I understand that a trainer may not be physically present to observe my environment, equipment, exercise technique, physical condition, or immediate response to exercise.

I am responsible for choosing a safe exercise area, using appropriate and properly maintained equipment, following provided instructions, stopping when an activity feels unsafe, and requesting clarification when needed.

6. EQUIPMENT, FACILITIES, AND PERSONAL PROPERTY

I understand that exercise may take place using equipment or at facilities not owned or controlled by AVAREN. I agree to use equipment responsibly and to follow applicable facility rules.

I understand that AVAREN is not responsible for loss, theft, or damage to my personal property except where responsibility cannot legally be excluded.

7. EMERGENCY CARE

If I become injured or experience a medical emergency during an in-person AVAREN session and I am unable to make decisions for myself, I authorize AVAREN personnel to contact emergency services and take reasonable steps to obtain emergency assistance.

I understand that I am responsible for costs associated with medical care, emergency transportation, or treatment unless otherwise required by law.

8. PERSONAL RESPONSIBILITY

I understand that results from personal training, exercise, nutrition, and lifestyle coaching vary from person to person and are not guaranteed.

I am responsible for my own choices outside supervised sessions, including exercise execution, nutrition decisions, sleep, recovery, adherence, and use of any recommendations provided through AVAREN.

9. SEVERABILITY

If any portion of this waiver is found to be invalid or unenforceable, the remaining provisions will continue in effect to the fullest extent permitted by law.

10. ACKNOWLEDGEMENT

I confirm that I have had the opportunity to read this entire waiver, ask questions, and understand the nature of the activities and risks described above.

I understand that by signing this document I am giving up certain legal rights. I sign it voluntarily and intend for my signature to apply to my participation in AVAREN personal training and fitness coaching services, whether in person or online.
`.trim()

export const AVAREN_LIABILITY_WAIVER_ACKNOWLEDGEMENT =
  'I confirm that I have read the AVAREN Personal Training Liability Waiver & Assumption of Risk shown above, understand its terms, understand that I am giving up certain legal rights, and agree to participate voluntarily.'

export const isAvarenLiabilityWaiverConfigured = () =>
  Boolean(AVAREN_LIABILITY_WAIVER_TEXT.trim())
